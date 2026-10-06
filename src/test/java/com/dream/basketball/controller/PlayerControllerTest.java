package com.dream.basketball.controller;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PlayerControllerTest {

    /** NBA 对访客公开以后，分页接口单次最多 2,000 行；页面自己最多也只要 2,000 行 */
    @Test
    void pageSize_isClampedBetweenOneAndMax() {
        assertEquals(2000, PlayerController.MAX_PAGE_SIZE);
        assertEquals(20, PlayerController.pageSize(20));
        assertEquals(2000, PlayerController.pageSize(2000));
        assertEquals(2000, PlayerController.pageSize(30000), "一次要三万行的请求被压到上限");
        assertEquals(1, PlayerController.pageSize(0));
        assertEquals(1, PlayerController.pageSize(-5));
    }

    @Test
    void toPlayerListPage() {
    }

    @Test
    void playerStatsList() {
    }

    @Test
    void playerStatsManagerList() {
    }

    @Test
    void playerManage() {
    }

    @Test
    void getData() {
    }

    @Test
    void getPlayerSeasonStatsList() {
    }

    @Test
    void getAllPlayersSeasonStatsList() {
    }

    @Test
    void insertAndSavePlayer() {
    }

    @Test
    void savePlayer() {
    }

    @Test
    void insertAndSavePlayerStats() {
    }

    @Test
    void savePlayerStats() {
    }

    @Test
    void deletePlayer() {
    }
}